import {
	BadRequestException,
	Controller,
	ForbiddenException,
	Post,
	Query,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { Messages } from '../../libs/enums/common.enum';
import { MemberType } from '../../libs/enums/member.enum';
import type { AuthMember as AuthMemberType } from '../../libs/types/common';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { detectImageType } from '../../libs/utils/image.util';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Folder name → who may upload into it. A fixed map, not a free string: writing to
 * `uploads/${target}` with `target=../../dist` would land outside the folder.
 */
const UPLOAD_TARGETS: Record<string, MemberType[]> = {
	member: [MemberType.USER, MemberType.AGENT, MemberType.DOCTOR, MemberType.ADMIN],
	clinic: [MemberType.AGENT],
	doctor: [MemberType.DOCTOR],
	// Health-tip photos: the members who may write tips (community.rules POSTERS).
	article: [MemberType.DOCTOR, MemberType.ADMIN],
};

/** What multer hands over with memoryStorage. */
interface UploadedImage {
	originalname: string;
	mimetype: string;
	size: number;
	buffer: Buffer;
}

/**
 * Images go through REST, not GraphQL. graphql-upload pulls in `dicer`,
 * whose multipart parser can be crashed by one malformed request (GHSA-wm7h-9275-46v2),
 * and it parses before any guard runs. Multer ships with @nestjs/platform-express and runs
 * after the guard, so an anonymous request never reaches the parser.
 */
@Controller('upload')
export class UploadController {
	@UseGuards(AuthGuard)
	@Post('image')
	@UseInterceptors(
		FileInterceptor('file', {
			storage: memoryStorage(),
			limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
		}),
	)
	public async uploadImage(
		@Query('target') target: string,
		@UploadedFile() file: UploadedImage | undefined,
		@AuthMember() authMember: AuthMemberType,
	): Promise<{ url: string }> {
		console.log('POST /upload/image');

		const allowed = UPLOAD_TARGETS[target];
		if (!allowed || !allowed.includes(authMember.memberType)) {
			throw new ForbiddenException(Messages.UPLOAD_TARGET_DENIED);
		}
		if (!file) throw new BadRequestException(Messages.UPLOAD_FAILED);

		const ext = detectImageType(file.buffer);
		if (!ext) throw new BadRequestException(Messages.PROVIDE_ALLOWED_FORMAT);

		const url = `uploads/${target}/${randomUUID()}.${ext}`;
		await mkdir(join(process.cwd(), 'uploads', target), { recursive: true });
		await writeFile(join(process.cwd(), url), file.buffer);
		return { url };
	}
}
