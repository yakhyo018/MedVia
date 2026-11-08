import {
	BadRequestException,
	Controller,
	ForbiddenException,
	Post,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { FaceScan } from '../../libs/dto/face-scan/face-scan';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FaceScanService } from './face-scan.service';
import { MAX_FACE_IMAGE_BYTES } from './face-scan.rules';

/**
 * The photo comes in over REST (multipart), like every image in MedVia (see UploadController):
 * multer runs after the guard, so an anonymous request never reaches the parser.
 * memoryStorage, not diskStorage — the photo must never touch the disk.
 * The result is the same FaceScan the GraphQL queries return.
 */
@Controller('face-scan')
export class FaceScanController {
	constructor(private readonly faceScanService: FaceScanService) {}

	@UseGuards(AuthGuard)
	@Post()
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			limits: { fileSize: MAX_FACE_IMAGE_BYTES, files: 1 },
		}),
	)
	public async scanFace(
		@UploadedFile() file: { buffer: Buffer } | undefined,
		@AuthMember() authMember: AuthMemberType,
	): Promise<FaceScan> {
		console.log('POST /face-scan');
		// RolesGuard reads the GraphQL context only; on REST the role is checked here.
		if (authMember.memberType !== MemberType.USER) {
			throw new ForbiddenException(Messages.FACE_SCAN_PATIENTS_ONLY);
		}
		if (!file) throw new BadRequestException(Messages.UPLOAD_FAILED);
		return await this.faceScanService.scan(authMember._id, file.buffer);
	}
}
