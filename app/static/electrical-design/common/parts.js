/* Component behaviour shared by both Electrical Design lessons (prompt 21). CLASSIC script —
   no `export`, for the same reason as draw.js.

   This file exists so the two lessons CANNOT drift apart. Lesson 1 teaches that an NTC
   thermistor's resistance falls as it warms and that a divider turns that into a voltage;
   lesson 2 asks the child to design around exactly that behaviour. If each lesson carried its
   own copy of the equations, one could be corrected and the other left wrong, and the child
   would be taught two different physics in two clicks.

   Everything here is the standard textbook model, not an invention:
     - the Beta equation for an NTC thermistor (10 kΩ at 25 °C, B = 3950),
     - a log-linear light/resistance curve for an LDR (~1 kΩ bright, ~200 kΩ dark),
     - the two-resistor divider,
     - an LED modelled as a fixed 2 V forward drop with the series resistor setting current. */

const EDP = {
  VCC: 5,
  FIXED_R: 10000,       // the divider's lower resistor, in both lessons
  LED_VF: 2.0,          // a red LED's forward drop
  LED_SERIES_R: 220,

  // NTC thermistor. Hotter -> LESS resistance. Input is °F because that is what the child sets.
  thermistorOhms(tempF) {
    const tK = (tempF - 32) * (5 / 9) + 273.15;
    return 10000 * Math.exp(3950 * (1 / tK - 1 / 298.15));
  },

  // LDR. Brighter -> LESS resistance. `lightPct` is 0 (pitch dark) to 100 (full daylight).
  ldrOhms(lightPct) {
    const p = Math.max(0, Math.min(100, lightPct)) / 100;
    return 200000 * Math.pow(0.005, p);
  },

  // Sensor on the supply side, fixed resistor to ground: more light and more heat both push
  // the tap voltage UP. Both lessons wire it this way round on purpose.
  divider(rTop, rBottom) {
    return EDP.VCC * (rBottom / (rTop + rBottom));
  },

  sensorVolts(rSensor) {
    return EDP.divider(rSensor, EDP.FIXED_R);
  },

  tempVolts(tempF) { return EDP.sensorVolts(EDP.thermistorOhms(tempF)); },
  lightVolts(lightPct) { return EDP.sensorVolts(EDP.ldrOhms(lightPct)); },

  // A 10-bit ADC, the size an MCU this size really has.
  adcCounts(volts) {
    return Math.round((Math.max(0, Math.min(EDP.VCC, volts)) / EDP.VCC) * 1023);
  },

  // What the LED actually draws. Without the series resistor there is nothing to set the
  // current at all, which is the point lesson 1 makes and lesson 2 relies on.
  ledCurrent(seriesOhms) {
    return (EDP.VCC - EDP.LED_VF) / Math.max(5, seriesOhms);
  },
};
