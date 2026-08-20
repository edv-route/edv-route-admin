/**
 * Photos allowed per vehicle.
 *
 * Dropped from 3 to ONE on 2026-08-20 (decisión de Luis, panel and app alike):
 * the driver sends one picture with his vehicle and that is what the admin
 * compares against the papers. The backend enforces it — this is here so the
 * panel doesn't offer an upload slot that would come back with a 409.
 *
 * It lives in ONE place because it used to live in three (`vehicle-form`,
 * `vehicle-draft-modal` and the vehicle detail), which is how a limit ends up
 * saying 3 in one screen and 1 in another.
 *
 * Vehicles photographed under the old limit KEEP their photos — nothing is
 * deleted — they simply cannot take another one.
 */
export const MAX_VEHICLE_PHOTOS = 1;
