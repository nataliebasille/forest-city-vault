/**
 * The `/vendors/[vendorId]` route. The edit slide-over is rendered by the vendors
 * {@link import("../vendor-panel-host").VendorPanelHost} (which reads the id from
 * this URL and looks the vendor up in the shared store), so this segment only
 * needs to exist for `/vendors/[vendorId]` to resolve.
 */
export default function VendorEditPage() {
  return null;
}
