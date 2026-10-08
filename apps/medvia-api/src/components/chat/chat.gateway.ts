import { Logger } from '@nestjs/common';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { SenderType } from '../../libs/enums/chat.enum';
import { Messages } from '../../libs/enums/common.enum';
import { TokenService } from '../auth/token.service';
import { ClinicService } from '../clinic/clinic.service';
import { sideOf } from './chat.rules';

/** Only our frontend may open a socket — the same rule as CORS for /graphql. */
const origins = (process.env.FRONTEND_URL ?? 'http://localhost:4000')
	.split(',')
	.map((o) => o.trim());

/** Per-socket expiry timers; kept out of socket.data, which adapters serialise. */
const expiryTimers = new WeakMap<Socket, NodeJS.Timeout>();

const memberAudience = (memberId: unknown) => `member:${String(memberId)}`;
const clinicAudience = (clinicId: unknown) => `clinic:${String(clinicId)}`;

/**
 * Push only: the server tells connected browsers that something changed. Messages are sent
 * through the GraphQL mutation (validation, guards, Postman), never through the socket.
 *
 * A socket joins one audience: `member:<id>` for a patient, `clinic:<id>` for a clinic account
 * (every tab of the team). A room's events go to its patient's and its clinic's audience, so a
 * new conversation needs no join.
 *
 * Auth runs once, in the handshake middleware (a refused socket never connects), with the access token. The token lives 15 minutes, so the
 * server cuts the socket when it expires; the client refreshes through the cookie and connects
 * again. A blocked member's open socket therefore dies within one token lifetime.
 */
@WebSocketGateway({ namespace: '/chat', cors: { origin: origins, credentials: true } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger(ChatGateway.name);

	@WebSocketServer() private readonly server!: Namespace;

	constructor(
		private readonly tokenService: TokenService,
		private readonly clinicService: ClinicService,
	) {}

	/** Handshake middleware: a refused socket never connects (the client gets connect_error). */
	public afterInit(server: Namespace): void {
		server.use(async (socket, next) => {
			try {
				const token = socket.handshake.auth?.token;
				if (typeof token !== 'string' || !token) throw new Error(Messages.TOKEN_NOT_EXIST);
				const member = await this.tokenService.verifyToken(token);
				const side = sideOf(member.memberType);

				let audience = memberAudience(member._id);
				if (side === SenderType.CLINIC) {
					const clinic = await this.clinicService.findClinicByMember(member._id);
					if (!clinic) throw new Error(Messages.NO_DATA_FOUND);
					audience = clinicAudience(clinic._id);
				}

				socket.data.audience = audience;
				socket.data.expiresAtMs = member.exp * 1000;
				next();
			} catch (err: any) {
				next(new Error(err?.message || Messages.NOT_AUTHENTICATED));
			}
		});
	}

	/** After the handshake passed: join the audience and schedule the cut at token expiry. */
	public async handleConnection(socket: Socket): Promise<void> {
		await socket.join(socket.data.audience);
		const delay = Math.max(socket.data.expiresAtMs - Date.now(), 0);
		expiryTimers.set(
			socket,
			setTimeout(() => socket.disconnect(true), delay),
		);
	}

	public handleDisconnect(socket: Socket): void {
		clearTimeout(expiryTimers.get(socket));
	}

	/** A new or updated message for both sides of a room. Never throws into the caller. */
	public emitMessage(
		room: { memberId?: unknown; clinicId?: unknown },
		event: string,
		payload: unknown,
	): void {
		try {
			this.server
				.to([memberAudience(room.memberId), clinicAudience(room.clinicId)])
				.emit(event, payload);
		} catch (err: any) {
			this.logger.warn(`socket emit ${event} failed: ${err.message}`);
		}
	}
}
