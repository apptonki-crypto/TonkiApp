/** Edad en años completos a partir de una fecha de nacimiento (partes UTC). */
export function ageFromBirthDate(birthDate: Date): number {
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}
