class QRIS {

  constructor(amount, qr_string) {
    const staticQris = qr_string;
    const updatedQris = staticQris.substring(0, staticQris.length - 4);
    const step1 = updatedQris.replace("010211", "010212");
    const step2 = step1.split("5802ID");
    const uang = `54${amount.toString().length
      .toString()
      .padStart(2, "0")}${amount}5802ID`;
    let dynamicQris = step2[0] + uang + step2[1];

    let crc = 0xffff;
    for (let i = 0; i < dynamicQris.length; i++) {
      crc ^= dynamicQris.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      }
    }
    dynamicQris += (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");

    this.value = dynamicQris;
  }

  toString() {
    return this.value;
  }

  toURL(size = 512) {
    const params = new URLSearchParams({
      text: this.value,
      size: String(size),
      ecLevel: "Q",
      dark: "000000",
      light: "fff9db",   
      margin: "2",
      centerImageWidth: "120",
      centerImageHeight: "120",
    });
    return `https://quickchart.io/qr?${params.toString()}`;
  }
}


module.exports = QRIS