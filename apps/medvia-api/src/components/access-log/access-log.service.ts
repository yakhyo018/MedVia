import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { AccessLogs, AccessLogsInquiry } from '../../libs/dto/access-log/access-log';
import { OrdinaryInquiry } from '../../libs/dto/common/inquiry';
import { AuthMember, T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { accessesOf, readerNameOf } from './access-log.rules';

/**
 * Who read a patient's medical data. Written by the booking module each time it decrypts the
 * answers or the AI summary for someone other than the patient; read by the patient ("who saw
 * my data?") and by the admin — who never sees the data itself, only that it was seen.
 */
@Injectable()
export class AccessLogService {
	private readonly logger = new Logger(AccessLogService.name);

	constructor(@InjectModel('AccessLog') private readonly accessLogModel: Model<T>) {}

	/**
	 * After the decrypt. Never throws: the reading already happened, and a lost log line is
	 * logged rather than turning the booking page into an error.
	 */
	public async recordReading(booking: T, reader: AuthMember, decrypted: boolean): Promise<void> {
		const types = accessesOf(booking, reader._id, decrypted);
		if (!types.length) return;
		try {
			const readerName = readerNameOf(reader.memberType, booking);
			await this.accessLogModel.insertMany(
				types.map((accessType) => ({
					accessType,
					bookingId: booking._id,
					bookingCode: booking.bookingCode,
					patientId: booking.memberId,
					readerId: reader._id,
					readerType: reader.memberType,
					readerName,
				})),
			);
		} catch (err: any) {
			this.logger.error(`access to ${String(booking._id)} not logged: ${err.message}`);
		}
	}

	/** "Who saw my medical data?" */
	public async getMyAccessLogs(patientId: ObjectId, input: OrdinaryInquiry): Promise<AccessLogs> {
		return await this.page({ patientId }, input.page, input.limit);
	}

	public async getAccessLogsByAdmin(input: AccessLogsInquiry): Promise<AccessLogs> {
		const match: T = {};
		if (input.patientId) match.patientId = shapeIntoMongoObjectId(input.patientId);
		if (input.bookingId) match.bookingId = shapeIntoMongoObjectId(input.bookingId);
		return await this.page(match, input.page, input.limit);
	}

	private async page(match: T, page: number, limit: number): Promise<AccessLogs> {
		const [result] = await this.accessLogModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1, _id: -1 } },
				{
					$facet: {
						list: [{ $skip: (page - 1) * limit }, { $limit: limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();
		return result as AccessLogs;
	}
}
