import { registerEnumType } from '@nestjs/graphql';

export enum Messages {
	SOMETHING_WENT_WRONG = 'Something went wrong!',
	NO_DATA_FOUND = 'No data is found!',
	CREATE_FAILED = 'Create is failed!',
	UPDATE_FAILED = 'Update is failed!',
	REMOVE_FAILED = 'Remove is failed!',
	UPLOAD_FAILED = 'Upload is failed!',
	BAD_REQUEST = 'Bad request!',

	NOT_AUTHENTICATED = 'You are not authenticated, login first!',
	TOKEN_NOT_EXIST = 'Bearer token is not provided!',
	TOKEN_CREATION_FAILED = 'Token creation error!',
	ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
	NOT_ALLOWED_REQUEST = 'Not allowed request!',
	BLOCKED_USER = 'You have been blocked, please contact support!',
	WRONG_CREDENTIALS = 'Wrong email or password!',
	WRONG_CURRENT_PASSWORD = 'The current password is incorrect!',
	USED_EMAIL = 'This email address is already registered!',
	TERMS_REQUIRED = 'Please accept the Terms of Use and Privacy Policy!',
	SESSION_EXPIRED = 'Your session has expired, please log in again!',
	GOOGLE_NOT_CONFIGURED = 'Google sign-in is not configured on this server!',
	GOOGLE_TOKEN_INVALID = 'Google sign-in failed, please try again!',
	PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, jpeg or png images!',
	SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',

	WRONG_STATUS = 'This action is not allowed in the current status!',
	CLINIC_FIELDS_LOCKED = 'Name, address and location of a verified clinic are changed through support!',
	CLINIC_NOT_READY = 'Add at least one photo and one reception language before approval!',
	REVIEW_NOTE_REQUIRED = 'Please write a message to the clinic!',
	INVALID_HOURS = 'Opening hours need one row per day, and opening must be before closing!',
	FOLLOW_TARGET_INVALID = 'This member cannot be followed!',
	ALREADY_FOLLOWING = 'You already follow this member!',
	NOT_FOLLOWING = 'You do not follow this member!',
	UPLOAD_TARGET_DENIED = 'You cannot upload images for this target!',
}

export enum Direction {
	ASC = 1,
	DESC = -1,
}
registerEnumType(Direction, { name: 'Direction' });

export enum Language {
	KO = 'KO',
	EN = 'EN',
	RU = 'RU',
	UZ = 'UZ',
	KK = 'KK',
	ZH = 'ZH',
}
registerEnumType(Language, { name: 'Language' });
