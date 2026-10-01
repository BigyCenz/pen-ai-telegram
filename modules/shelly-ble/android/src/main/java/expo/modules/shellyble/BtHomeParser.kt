package expo.modules.shellyble

// Parser minimale del formato BTHome v2 (https://bthome.io/format/), quanto
// basta per lo Shelly BLU Button1.
//
// Il service data (UUID 0xFCD2) è: [device info][oggetti...]. Ogni oggetto è
// [id][valore], con lunghezza del valore fissata dall'id. Gli oggetti sono
// ordinati per id crescente, quindi se ne incontro uno che non conosco mi
// fermo: non posso sapere quanti byte occupa e leggere oltre darebbe valori
// senza senso.
data class BtHomeReading(
  val packetId: Int?,
  val battery: Int?,
  val buttonEvent: String?, // single | double | triple | long | hold, null se assente/"nessun evento"
  val encrypted: Boolean,
  val stoppedAtUnknownId: Int?, // id sconosciuto che ha interrotto il parsing, per il log
)

object BtHomeParser {
  // Lunghezze (in byte) dei soli oggetti che so gestire. Gli altri fermano il parsing.
  private val LENGTHS = mapOf(
    0x00 to 1, // packet id
    0x01 to 1, // batteria %
    0x02 to 2, // temperatura
    0x03 to 2, // umidità
    0x3A to 1, // evento pulsante
    0x3F to 2, // rotazione
  )

  fun buttonName(code: Int): String? = when (code) {
    0x01 -> "single"
    0x02 -> "double"
    0x03 -> "triple"
    0x04 -> "long"
    0x80 -> "hold"
    else -> null
  }

  fun parse(data: ByteArray): BtHomeReading? {
    if (data.isEmpty()) return null
    val info = data[0].toInt() and 0xFF
    val encrypted = (info and 0x01) != 0
    val version = (info shr 5) and 0x07
    if (version != 2) return null
    if (encrypted) return BtHomeReading(null, null, null, true, null)

    var packetId: Int? = null
    var battery: Int? = null
    var button: String? = null
    var unknown: Int? = null

    var i = 1
    while (i < data.size) {
      val id = data[i].toInt() and 0xFF
      val len = LENGTHS[id]
      if (len == null) {
        unknown = id
        break
      }
      if (i + 1 + len > data.size) break
      val v = data[i + 1].toInt() and 0xFF
      when (id) {
        0x00 -> packetId = v
        0x01 -> battery = v
        0x3A -> button = buttonName(v)
      }
      i += 1 + len
    }
    return BtHomeReading(packetId, battery, button, false, unknown)
  }
}
