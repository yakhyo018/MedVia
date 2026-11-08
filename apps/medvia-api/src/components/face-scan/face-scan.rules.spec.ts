import { Specialty } from '../../libs/enums/clinic.enum';
import { ConcernSeverity, FaceZone, SkinConcern } from '../../libs/enums/face-scan.enum';
import { dailyFaceScansKey, specialtyFor } from './face-scan.rules';

describe('face-scan rules', () => {
	it('routes any finding to dermatology, and nothing to nowhere', () => {
		expect(
			specialtyFor([
				{ concern: SkinConcern.WRINKLES, severity: ConcernSeverity.MILD, zone: FaceZone.EYES },
			]),
		).toBe(Specialty.DERMATOLOGY);
		expect(specialtyFor([])).toBeUndefined();
	});

	it('keys the daily counter by member and Seoul date', () => {
		expect(dailyFaceScansKey('m1', '2026-11-06')).toBe('face:scans:m1:2026-11-06');
	});
});
