import { BadRequestException } from '@nestjs/common';
import { ClinicHourInput } from '../../libs/dto/clinic/clinic.input';
import { Messages } from '../../libs/enums/common.enum';
import { T } from '../../libs/types/common';

/**
 * Opening hours as the clinic profile stores them: one row per weekday, sorted; a closed day
 * keeps no times; an open day needs both times and opens before it closes.
 * "HH:mm" strings compare correctly as text, so no date parsing is needed.
 */
export function normalizeHours(hours: ClinicHourInput[]): T[] {
	const days = new Set(hours.map((h) => h.day));
	if (days.size !== hours.length) throw new BadRequestException(Messages.INVALID_HOURS);

	return hours
		.map((h) => {
			if (h.closed) return { day: h.day, closed: true };
			if (!h.open || !h.close || h.open >= h.close) {
				throw new BadRequestException(Messages.INVALID_HOURS);
			}
			return { day: h.day, open: h.open, close: h.close, closed: false };
		})
		.sort((a, b) => a.day - b.day);
}
