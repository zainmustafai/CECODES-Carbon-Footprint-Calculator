// The sector list offered to companies. Slugs are stored, labels are translated
// (company.sectors.<slug>), so the stored value is language neutral.
//
// Company.sector stays a free string in the schema. That is deliberate: companies
// onboarded before this list existed may hold any text, and a Postgres enum would have to
// be recreated to add a sector. The form renders an unknown stored value as a verbatim
// option so it is never silently discarded on save.
export const SECTORS = [
  "agroindustria-alimentos",
  "manufactura",
  "energia",
  "mineria-hidrocarburos",
  "construccion",
  "transporte-logistica",
  "comercio",
  "servicios-financieros",
  "tecnologia-telecomunicaciones",
  "salud",
  "educacion",
  "turismo-hoteleria",
  "sector-publico",
  "otro",
] as const;

export type Sector = (typeof SECTORS)[number];

export function isKnownSector(value: string): value is Sector {
  return (SECTORS as readonly string[]).includes(value);
}
