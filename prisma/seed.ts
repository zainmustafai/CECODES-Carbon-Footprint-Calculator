import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

// Seed starter reference data. Safe to re-run (idempotent).
// The full emission-factor library is loaded separately once CECODES confirms the dataset.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// Scope-2 national grid factor (SIN) by year — kg CO2 / kWh (source: UPME/XM). Req. §7.3
const gridFactors = [
  { year: 2013, factor: "0.2" },
  { year: 2019, factor: "0.17" },
  { year: 2021, factor: "0.126378" },
  { year: 2022, factor: "0.1123708" },
  { year: 2023, factor: "0.1728" },
  { year: 2024, factor: "0.217" },
];

// Emission-factor library version history (from the Excel "Control de Cambios").
const versions = [
  {
    version: "v001",
    date: new Date("2024-12-19"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description:
      "Registro de factores de emisión usados en la herramienta de huella de carbono de CECODES durante 2024.",
  },
  {
    version: "v002",
    date: new Date("2025-05-20"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description:
      "Se agregó el factor de emisión por consumo de energía eléctrica para el año 2024.",
  },
  {
    version: "v003",
    date: new Date("2025-06-27"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description: "Actualización de jerarquía de categorías y elementos.",
  },
  {
    version: "v004",
    date: new Date("2025-07-14"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description: null,
  },
  {
    version: "v005",
    date: new Date("2025-10-21"),
    preparedBy: "Sebastian Gómez",
    reviewedBy: "Angélica Atencio",
    authorizedBy: "Danna Lasso",
    description:
      "Ajuste de valores incorrectos de C6 y C7; corrección FE CO2 para aceites lubricantes; corrección de alcance para SF6; renombrado 'cascarilla de arroz' (fijo).",
  },
];

async function main() {
  for (const g of gridFactors) {
    await prisma.gridElectricityFactor.upsert({
      where: { year: g.year },
      update: { factor: g.factor, source: "UPME/XM (SIN)" },
      create: { year: g.year, factor: g.factor, source: "UPME/XM (SIN)" },
    });
  }

  for (const v of versions) {
    const existing = await prisma.emissionFactorVersion.findFirst({
      where: { version: v.version },
    });
    if (!existing) await prisma.emissionFactorVersion.create({ data: v });
  }

  const gf = await prisma.gridElectricityFactor.count();
  const vv = await prisma.emissionFactorVersion.count();
  console.log(`Seeded ✓  grid factors=${gf}  factor versions=${vv}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
