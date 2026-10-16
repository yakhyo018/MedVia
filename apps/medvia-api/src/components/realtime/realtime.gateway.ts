import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Model } from 'mongoose';
import type { Namespace, Socket } from 'socket.io';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import { T } from '../../libs/types/common';
import { TokenService } from '../auth/token.service';

/** Only our frontend may open a socket — the same rule as CORS for /graphql. */
const origins = (process.env.FRONTEND_URL ?? 'http://localhost:4000')
	.split(',')
	.map((o) => o.trim());

/** Per-socket expiry timers; kept out of socket.data, which adapters serialise. */
const expiryTimers = new WeakMap<Socket, NodeJS.Timeout>();

const memberAudience = (memberId: unknown) => `member:${String(memberId)}`;
const clinicAudience = (clinicId: unknown) => `clinic:${String(clinicId)}`;

/**
 * The one socket of the app (namespace `/live`): chat messages and notifications. Push only —
 * everything is written through GraphQL, the socket only says that something changed.
 *
 * Every member joins `member:<id>` (their notifications); a clinic account also joins
 * `clinic:<id>`, the audience of its chat rooms (every tab of the team). Its own module, so
 * chat and notifications both push through it without importing each other — and it reads the
 * Clinic model directly, because ClinicModule leads (through follow) back to notifications.
 *
 * Auth runs once, in the handshake middleware (a refused socket never connects), with the
 * access token; the server cuts the socket when that token expires, so a blocked member's
 * socket dies within one token lifetime.
 */
@WebSocketGateway({ namespace: '/live', cors: { origin: origins, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(RealtimeGateway.name);

	@WebSocketServer() private readonly server!: Namespace;

	constructor(
		private readonly tokenService: TokenService,
		@InjectModel('Clinic') private readonly clinicModel: Model<T>,
	) {}

	public afterInit(server: Namespace): void {
		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth?.token;
				if (typeof token !== 'string' || !token) throw new Error(Messages.TOKEN_NOT_EXIST);
				const member = await this.tokenService.verifyToken(token);

				const audiences = [memberAudience(member._id)];
				if (member.memberType === MemberType.AGENT) {
					const clinic = await this.clinicModel
						.findOne({ memberId: member._id }, { _id: 1 })
						.lean()
						.exec();
					if (!clinic) throw new Error(Messages.NO_DATA_FOUND);
					audiences.push(clinicAudience(clinic._id));
				}

				socket.data.audiences = audiences;
				socket.data.expiresAtMs = member.exp * 1000;
				next();
			} catch (err: any) {
				next(new Error(err?.message || Messages.NOT_AUTHENTICATED));
			}
		});
	}

	/** After the handshake passed: join the audiences and schedule the cut at token expiry. */
	public async handleConnection(socket: Socket): Promise<void> {
		await socket.join(socket.data.audiences);
		const delay = Math.max(socket.data.expiresAtMs - Date.now(), 0);
		expiryTimers.set(
			socket,
			setTimeout(() => socket.disconnect(true), delay),
		);
	}

	public handleDisconnect(socket: Socket): void {
		clearTimeout(expiryTimers.get(socket));
	}

	/** Both sides of a chat room: its patient and its clinic's team. Never throws. */
	public emitToRoom(
		room: { memberId?: unknown; clinicId?: unknown },
		event: string,
		payload: unknown,
	): void {
		this.emit([memberAudience(room.memberId), clinicAudience(room.clinicId)], event, payload);
	}

	/** One member, every tab of theirs. Never throws. */
	public emitToMember(memberId: unknown, event: string, payload: unknown): void {
		this.emit([memberAudience(memberId)], event, payload);
	}

	private emit(audiences: string[], event: string, payload: unknown): void {
		try {
			this.server.to(audiences).emit(event, payload);
		} catch (err: any) {
			this.logger.warn(`socket emit ${event} failed: ${err.message}`);
		}
	}
}
