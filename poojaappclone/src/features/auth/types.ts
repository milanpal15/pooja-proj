/** Where the sign-in flow is. `profile` is Create Profile. */
export type Step = 'select' | 'entry' | 'otp' | 'profile';

/** A field on Create Profile that a validation message can point at. */
export type ProfileField = 'name' | 'gender' | 'dob' | 'email';

/** Which provider just succeeded in this session. */
export type SignedInBy = 'phone' | 'google';

/** Date of birth as the three boxes the devotee types into. */
export type DobParts = { d: string; m: string; y: string };
