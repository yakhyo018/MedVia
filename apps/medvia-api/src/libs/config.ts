import { Types } from 'mongoose';

export const availableMemberSorts = [
	'createdAt',
	'updatedAt',
	'memberFullName',
	'memberLastLoginAt',
];

/** GraphQL hands ids over as strings; Mongo compares ObjectIds. */
export const shapeIntoMongoObjectId = (target: any) => {
	return typeof target === 'string' ? new Types.ObjectId(target) : target;
};

/**
 * Escapes user text before it goes into a RegExp. Without it, a search for "a.*"
 * matches everything, and a crafted pattern like "(a+)+$" can freeze the event loop.
 */
export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
