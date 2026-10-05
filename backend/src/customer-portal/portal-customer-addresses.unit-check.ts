import { PortalCustomerAddressesService } from "./portal-customer-addresses.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const service = new PortalCustomerAddressesService({} as never, {} as never, {} as never);

const resolved = service.resolveSelectedAddress(
  [
    {
      id: "primary",
      label: "Primary",
      line1: "1 Main",
      line2: null,
      city: "Calgary",
      region: "AB",
      postalCode: "T2P1A1",
      isPrimary: true,
    },
    {
      id: "job-1",
      label: "Past job",
      line1: "2 Other",
      line2: null,
      city: "Calgary",
      region: "AB",
      postalCode: "T2P1A2",
      isPrimary: false,
    },
  ],
  "job-1",
  null,
);

assert(resolved?.line1 === "2 Other", "selected address resolves");

const newAddress = service.resolveSelectedAddress([], null, {
  line1: "9 New",
  line2: null,
  city: "Ottawa",
  region: "ON",
  postalCode: "K1A0A1",
});
assert(newAddress?.city === "Ottawa", "new address resolves");

console.log("portal-customer-addresses.unit-check: ok");
