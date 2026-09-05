/** Local-only development fixtures. `src/api.ts` gates all fallback use to loopback hosts. */
import type { DashboardStats, Lead, SiteSettings, Vehicle } from "../lib/types";

const placeholder = "/vehicle-placeholder.svg";
const now = new Date().toISOString();

export const demoSettings: SiteSettings = {
  businessName: "Your Choice Auto Group LLC",
  shortName: "YC Auto USA",
  phone: "718-799-0606",
  smsNumber: "",
  email: "sophie@youxuancars.com",
  address: "167-04 Northern Blvd, Flushing, NY 11358",
  businessHours: "Mon–Fri 10:00 AM–6:00 PM · Sat–Sun 12:00 PM–5:00 PM",
  heroTitle: "Find Your Next Car",
  heroSubtitle: "Quality pre-owned vehicles in Flushing, New York.",
  heroTitleZh: "找到你的下一辆车",
  heroSubtitleZh: "纽约法拉盛优质二手车，信息透明，选车更轻松。",
  aboutText:
    "YC Auto USA is a neighborhood pre-owned vehicle dealer serving drivers in Flushing and the surrounding New York area. Browse our current inventory online, then call or send a note to arrange a visit.",
  aboutTextZh:
    "YC Auto USA 是一家位于纽约法拉盛的社区二手车行，为法拉盛及纽约周边地区的驾驶者服务。您可以先在线浏览当前库存，再致电或留言预约到店。",
  whyChooseText:
    "Straightforward inventory, clear details, and a local team ready to help you choose with confidence.",
  whyChooseTextZh:
    "实时库存、清晰车辆信息，以及随时为您提供帮助的本地团队，让选车更简单、更安心。",
  leadNotificationRecipient: "sophie@youxuancars.com",
  seoTitle: "YC Auto USA | Quality pre-owned vehicles in Flushing, NY",
  seoDescription:
    "Browse quality pre-owned cars, SUVs, and trucks from YC Auto USA in Flushing, New York.",
  seoTitleZh: "YC Auto USA 优选汽车｜纽约法拉盛二手车",
  seoDescriptionZh:
    "浏览 YC Auto USA 在纽约法拉盛提供的优质二手轿车、SUV 和卡车库存。",
  whatsappNumber: null,
  logoKey: null,
  faviconKey: null,
  updatedAt: now,
};

function demoVehicle(
  input: Partial<Vehicle> & Pick<Vehicle, "id" | "slug" | "title">,
): Vehicle {
  return {
    id: input.id,
    slug: input.slug,
    status: input.status ?? "available",
    featured: input.featured ?? false,
    title: input.title,
    year: input.year ?? 2022,
    make: input.make ?? "Toyota",
    model: input.model ?? "RAV4",
    trim: input.trim ?? "XLE",
    vin: input.vin ?? null,
    stockNumber: input.stockNumber ?? null,
    priceCents: input.priceCents ?? 2499000,
    mileage: input.mileage ?? 31800,
    exteriorColor: input.exteriorColor ?? "Silver",
    interiorColor: input.interiorColor ?? "Black",
    bodyType: input.bodyType ?? "SUV",
    drivetrain: input.drivetrain ?? "AWD",
    transmission: input.transmission ?? "Automatic",
    fuelType: input.fuelType ?? "Gasoline",
    engine: input.engine ?? "2.5L 4-cyl",
    description:
      input.description ??
      "A clean, comfortable pre-owned vehicle with practical features for city driving and weekend trips.",
    features: input.features ?? [
      "Backup camera",
      "Bluetooth",
      "Keyless entry",
      "Apple CarPlay",
    ],
    legacyUrl: input.legacyUrl ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    publishedAt: input.publishedAt ?? now,
    soldAt: input.soldAt ?? null,
    deletedAt: null,
    images: input.images ?? [
      {
        id: `${input.id}-cover`,
        vehicleId: input.id,
        r2Key: "",
        originalFilename: null,
        contentType: "image/svg+xml",
        byteSize: null,
        width: 1200,
        height: 800,
        position: 0,
        isCover: true,
        createdAt: now,
        deletedAt: null,
      },
    ],
  };
}

export const demoVehicles: Vehicle[] = [
  demoVehicle({
    id: "demo-1",
    slug: "2022-toyota-rav4-xle-demo1",
    title: "2022 Toyota RAV4 XLE",
    year: 2022,
    make: "Toyota",
    model: "RAV4",
    trim: "XLE",
    priceCents: 2699000,
    mileage: 28412,
    featured: true,
    exteriorColor: "Lunar Rock",
    bodyType: "SUV",
    drivetrain: "AWD",
  }),
  demoVehicle({
    id: "demo-2",
    slug: "2021-honda-accord-sport-demo2",
    title: "2021 Honda Accord Sport",
    year: 2021,
    make: "Honda",
    model: "Accord",
    trim: "Sport",
    priceCents: 2299000,
    mileage: 36105,
    featured: true,
    exteriorColor: "Platinum White",
    bodyType: "Sedan",
    drivetrain: "FWD",
  }),
  demoVehicle({
    id: "demo-3",
    slug: "2020-mercedes-benz-glc-300-demo3",
    title: "2020 Mercedes-Benz GLC 300",
    year: 2020,
    make: "Mercedes-Benz",
    model: "GLC 300",
    trim: null,
    priceCents: 3199000,
    mileage: 44210,
    featured: true,
    exteriorColor: "Obsidian Black",
    bodyType: "SUV",
    drivetrain: "4MATIC",
  }),
  demoVehicle({
    id: "demo-4",
    slug: "2019-subaru-outback-premium-demo4",
    title: "2019 Subaru Outback Premium",
    year: 2019,
    make: "Subaru",
    model: "Outback",
    trim: "Premium",
    priceCents: 1899000,
    mileage: 57880,
    featured: false,
    exteriorColor: "Crystal White",
    bodyType: "Wagon",
    drivetrain: "AWD",
  }),
  demoVehicle({
    id: "demo-5",
    slug: "2023-kia-telluride-sx-demo5",
    title: "2023 Kia Telluride SX",
    year: 2023,
    make: "Kia",
    model: "Telluride",
    trim: "SX",
    priceCents: 3899000,
    mileage: 15400,
    featured: false,
    exteriorColor: "Everlasting Silver",
    bodyType: "SUV",
    drivetrain: "AWD",
  }),
  demoVehicle({
    id: "demo-6",
    slug: "2018-ford-f-150-xlt-demo6",
    title: "2018 Ford F-150 XLT",
    year: 2018,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    priceCents: 2499000,
    mileage: 67200,
    featured: false,
    exteriorColor: "Oxford White",
    bodyType: "Truck",
    drivetrain: "4WD",
    status: "pending",
  }),
];

export const demoLeads: Lead[] = [];
export const demoStats: DashboardStats = {
  available: 5,
  pending: 1,
  sold: 0,
  draft: 0,
  newLeads: 0,
};

export function demoImage(vehicle: Vehicle): string {
  const cover =
    vehicle.images?.find((image) => image.isCover) ?? vehicle.images?.[0];
  return cover?.r2Key ? `/media/${cover.r2Key}` : placeholder;
}
