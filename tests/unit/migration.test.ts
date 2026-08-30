import { describe, expect, it } from "vitest";
import {
  discoverProductLinks,
  isLikelyVehicleImage,
  parseLegacyProduct,
} from "../../lib/migration-parser";

describe("legacy migration parser", () => {
  const html = `<html><head><title>2020 PORCHE Macan</title></head><body><div>VIN: 1HGCM82633A004352</div><div>MILEAGE: 45,200</div><div>PRICE: $31,500</div><div>COLOR: Blue</div><div>DRIVE TRAIN: AWD</div><div>TRANSMISSION: AUTO</div><div>Product description: One owner.</div><img src="/Uploads/image/car-1.jpg"><img src="/Uploads/image/logo.jpg"><a href="/products/car-p.html">view</a></body></html>`;
  it("parses labels independent of template classes", () => {
    const record = parseLegacyProduct(
      html,
      "https://legacy.test/products/car-p.html",
    );
    expect(record.title).toBe("2020 Porsche Macan");
    expect(record.priceCents).toBe(3150000);
    expect(record.mileage).toBe(45200);
    expect(record.transmission).toBe("Automatic");
    expect(record.imageUrls).toHaveLength(1);
    expect(record.status).toBe("available");
    expect(record.normalizationChanges).toEqual(
      expect.arrayContaining([
        "PORCHE normalized to Porsche",
        "AUTO normalized to Automatic",
      ]),
    );
  });
  it("filters non-gallery assets and discovers product links", () => {
    expect(
      isLikelyVehicleImage("https://legacy.test/Uploads/image/car.webp"),
    ).toBe(true);
    expect(
      isLikelyVehicleImage("https://legacy.test/Uploads/image/logo.webp"),
    ).toBe(false);
    expect(
      discoverProductLinks(html, "https://legacy.test/products.html"),
    ).toEqual(["https://legacy.test/products/car-p.html"]);
  });
  it("does not mistake HTML attributes for an empty product description", () => {
    const record = parseLegacyProduct(
      '<meta name="description" content=""><li>Product description：</li>',
      "https://legacy.test/products/empty-p.html",
    );
    expect(record.description).toBeNull();
  });
});
