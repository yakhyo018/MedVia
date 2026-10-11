/*************************************************
 *
 *                 BATCH CONSTANTS
 *
 *************************************************/

/** Cron times are Seoul time — the clinics' night, whatever the server's zone. */
export const BATCH_TIME_ZONE = 'Asia/Seoul';

export const CRON_SLOT_RELEASE = '0 */5 * * * *';
/** Before RANK: the score reads the counters RECOUNT has just made right. */
export const CRON_RECOUNT = '0 30 2 * * *';
export const CRON_RANK = '0 0 3 * * *';
