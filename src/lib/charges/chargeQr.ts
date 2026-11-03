import QRCode from "qrcode";

/** PNG data URL of the public claim link. The phone camera opens the browser. */
export async function renderChargeQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 280,
    errorCorrectionLevel: "M",
    color: {
      dark: "#2d210d",
      light: "#fefdf5",
    },
  });
}
