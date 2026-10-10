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
	CLINIC_CANNOT_ADD_DOCTORS = 'A rejected or deleted clinic cannot add doctors!',
	CLINIC_CANNOT_ADD_TREATMENTS = 'A rejected or deleted clinic cannot add treatments!',
	INVALID_DOCTORS = 'Choose at least one doctor of this clinic!',
	TREATMENT_NEEDS_DOCTOR = 'Assign at least one doctor before showing this treatment!',
	DRAFT_CHANGED = 'The clinic changed this edit while you were reviewing it, please reload!',
	NOTHING_TO_REVIEW = 'There is nothing waiting for review on this treatment!',

	SLOT_RANGE_INVALID = 'Slots can be added from today, at most 31 days at a time and 60 days ahead!',
	SLOT_TIME_INVALID = 'The start time must be before the end time!',
	SLOT_NOT_AVAILABLE = 'This time is no longer available, please choose another one!',
	SLOT_TOO_SOON = 'This time starts too soon to book, please choose a later one!',
	HOLD_EXPIRED = 'Your reserved time has expired, please choose the time again!',
	TREATMENT_NOT_BOOKABLE = 'This treatment cannot be booked with this doctor!',
	LANGUAGE_NOT_OFFERED = 'The clinic does not offer this language or interpreter!',
	CONSENT_REQUIRED = 'Please give the required consents to send the request!',
	TOO_MANY_REQUESTS = 'You already have 3 requests waiting for clinics!',
	TRANSITION_NOT_ALLOWED = 'This booking cannot be changed this way!',
	REASON_REQUIRED = 'Please write the reason!',
	CANCEL_TOO_LATE = 'A confirmed booking can be cancelled up to 24 hours before the visit!',
	VISIT_NOT_STARTED = 'This can be set only after the visit time has started!',
	VISIT_STARTED = 'The visit time has already started!',
	RESPOND_DEADLINE_PASSED = 'The time to answer this request has passed!',
	DOCTOR_HAS_BOOKINGS = 'This doctor still has upcoming bookings, cancel or finish them first!',

	REVIEW_NOT_COMPLETED = 'Only a completed visit can be reviewed!',
	REVIEW_WINDOW_CLOSED = 'A review can be written within 30 days of the visit!',
	ALREADY_REVIEWED = 'This visit already has a review!',
	REVIEW_MESSAGE_REQUIRED = 'Please write a message to the patient!',
	REVIEW_CHANGED = 'The patient changed this review while you were reading it, please reload!',
	MODERATION_NOT_ALLOWED = 'This decision is not possible for the review in its current status!',

	CATEGORY_NOT_ALLOWED = 'You cannot write in this board!',
	CANNOT_REPORT_OWN = 'You cannot report your own post or comment!',
	ALREADY_REPORTED = 'You have already reported this!',
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
