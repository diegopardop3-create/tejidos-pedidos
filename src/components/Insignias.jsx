// Iconos de prenda para las insignias (imágenes pequeñas incrustadas).
// Camiseta: cuello y puño lisos. Chaqueta: cuello, puño y pretina de resorte.
import { TIPO_LABEL } from './constants'

const IMG = {
  cuello: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAkFBMVEUpcd4iaNgmbN1hqv8aVLcVULAYNnocXqgfVbMAf381gvd/f/8/Pz8bPokWPpcpadI7iv9VAABDkf9/z/+L0P////8AAAAJR68aY9gTWs0EOJIqd+0ibeIhadsAf/8CKHgdauY1hPgAAP8AVaoALYIAVf8AAH8aRpobXckFP6BIl/8AHGMAP78AVVUA//8XK2c06QOhAAAAMHRSTlMZ0KYZof8rHEkCkgIEJUVEawNbEAsEAP78/v79+fwC/v7+AQP+AwJE0P4s/wQDAREeNTifAAABhklEQVR42sWT6Y7bMAyE6Stx0vviUqIuK4ntNNvk/d+upO10HWyB/uuOAUPyfBoKFgX4D8F/BfI1hHfyhHDNr4Dddts/LDxBWAH5pO8f36rqp6qqvus85FVC9XVfFs4vcq4oP1d/EnKo9s40Tw8yxu0rzRDghGUXo7Vr/2yPkUuxBAgZ3ApYkmyMTJCDAM9Yps5fHhOsvTRsSjEBEIi4ay7xaK09T6a1x0vTkTGfJr8gI4SNk3svYDtnjCGxoUgkYrZH+1IgMhsFCgBmsY3xK0IGs29M8lCwU4B8xxIsuzirrxuYgAJaZq8Z5Lh7UkLr332iFnCKUAlRCBGbjhPNdhrfA7bsFoJ9PWw2Qy3bmn1KLcqpSoSfEujjfD4DpXlFGr8EOODWa4bjcYPhl+iEH8aFaPEAeMBaIhyXN/mxk57xViZBUi0mYB9uJESNMlskg5pSMtvQ63FLERoHvPbr9sRhpEFJ7aiMG+2Kx55E+ZjvLbdbxa/K7F56ss+vL0Tu3+Dq/V2/ASC7XlpJ/qa9AAAAAElFTkSuQmCC',
  puno: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAAOCAMAAABNey+cAAAAkFBMVEUBNo8CK3oALYMaVLIkV7AOMnoEQqMAPaFVdbEDQJ4uY7tYh8pIaKdlkM4qTZNNesVjjcwgTqU/dL5EXZ0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADyHN86AAAAMHRSTlP//////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABPNGsBAAAA6klEQVR42m1SBwKDMAg8yFJrteP/fy0hIZK2WbIOLxA8ti3KesYYQ5/uY6YQTAxZ5RMB4MJgkGxZVQFUh0rVPkxNkUl49SC16tGUIWg8Syx3r84DN6yWF38EcpsNJil2AY7MGBwzbPQrOLJZzx0PxjQYztCJzj7964I7Loc56Rs6fFaFBgQwx5In2lSeExuQfc4fqvyH/1KLc2GqucxXznQVzuXaDcg+EqVzlz+t5J8AGzDidLWXsVKhdaoVZWRyrSqa50CENAbFU/FkW9u+2qrclxqbSB9BEloJKSWIpcalZq5CgnqJVKL3B+7eA/tJGeI9AAAAAElFTkSuQmCC',
  cuelloChaq: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAkFBMVEUnVKYYS6cebORWaqFMnvkXXsqw8v8AFbEQTK3///8KUrwQV8IQM3gAD0AUOpEGUMA/iulmZmZGccZ///+/v7+fv////wAAAAAANZMAJ3YALYICQ6wBPKMAVaoAAP8AF1AIOpIAf38PPJMJR64AHmEAP38LOpEmWLEAAH8MQp0PRqQAf/8A//8zSo4jatcpdePBpdAxAAAAMHRSTlMiXCUOEHIEA5MC1qSq/3L/GAUSCgQIAQD8/v76/gMB/s8Ci8/+BK8pAq2QAgEXNSKhhID6AAABZklEQVR42sWT13KEMAxFRd2W3iQsbGDZXv//7yIZA5NNZvKW6IGxfI+ubSwD/hLwt4A7Nc3xeGxO7hvg7HrytdBOrBsB64ezNI2v8eV6fUpnOEx3Dq+X6LCvqQ9u22kW5+g6oMmzuhjDGENGsTbDkwIWs7KqqlVQSQDToY+Rs+qQz0mAqi8XOQC8xwmCdTFzcR8Aj4QRE6VuBzEumLjo1xiDqKAprgEvXMq+qbpBmMSNAOF9roAQxcrvUcMUmqtLPYMFl6USpZ9SQvYQdMn2wOx1NSmNzqksI38emYWpOgSklGpDzGSKHljCS8s8EER3G5F9vU/rBHDLPMhEmJL/lwGQU1ghRoP6GQIQdKt3sW15ADCvlfDJ5oz+Liy+Rf0qG8Th1h8+tCO0HxrE7aFbZ4m46ayWZ8Td0DBCJtFSaiPEg6pR0vdZaNqdzxKQMoDE17ibrpa+Hdt7bX9+F67xH/ePT+/H+ASQ8WCNBgyCIwAAAABJRU5ErkJggg==',
  punoChaq: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAkFBMVEUlaOAaSKkKNZQfX9BVkvERL3kPN5VQZ6waNn0JJm01V6sPSLVKed+vr78AVVUAAAADRbgFTMQBOqgBM5gJUs8AFEgBInAAP38CLIsADTQAVaoAHWcWOowAAH8QNYoAP78AEDwAAP8Af38Af/8AAD8AAFUaV8r///8AAKoRMn4dPIkMN5YPSboQSrgA//8oRY3s2fmRAAAAMHRSTlMjY9JIFp2UFWvXIdEYBgMA/v7+/P78/QT8/QP/bwOVBP0BAgIEA24DA4xStJWoATLeMplGAAABYklEQVR42rWT6XKDIBSFr1u2JkUwgqUqLlWzNu//dr0gLq2Z6Z/2DMPgPZ8HEAHyi+BPgUoqIZSsywVQ1lKpZl5uhJDSgFCp01D1vfZ2az3wu6FyEpVJ8MFzbnc3iqIkYti71+vKcWBvEqC9v2CRMRZiQzGmH5BNEjd3dmDcsBfT9iCNcJ7AztUvsgHQnfUNsQHShkPApDHC7SBbj2X6A0EiJXAid+tS1HcgSR4EFHHowh6A6IDbJB61vkHofIoryUAS0LXnQI5AbQA600hoQMAn2Y9AaBqdElID+MY8fo9YAnQM6RENMA1UuAb7+nGRoYHaAHMZsAccovQ2bZ2G9oyYPT7GVgjghzpSFvE4jovizajAcYwn3W8Tp2C8mAwrPeaJXgMpiRNsOX8fxa22q8th+O279eOSbs55EATnPM/PaXp5rLvxt5fN8zvTyOnilJUUQmTZByrLcChfs/+4m0/1BZiiSF1SC4MdAAAAAElFTkSuQmCC',
  pretina: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADgAAAANCAMAAADL710yAAAAkFBMVEUUQpwWRqQPOYscUbQAAAAJLHUTOogUOocaRpsiUa0WO4QMMXwYO4IbSaEpWbYmVrAZOn4cR5wYRJkbSaMkP3syR3w1aMlNivVpaXYAAKoNLnUWN34VOX4VOH8QNX4fPoEZO4EbQYUfT6MAVaoeVsAhT6s/VX88VYVFXItFe+BYk/93u/8AAAAAAAAAAAAAAACFeuL0AAAAMHRSTlP9/vv+APrTsNWQjvZwyk1rTpS5ryoXMhcIA8R9jabKOVFSkQP/qgwVCyEaDwAAAAAFDSUkAAAA70lEQVR42pWSiXLDIAxEFxmDwVfupGfuNsf//1/BnPGkM+16xoDQ08pjgXN+v666vleH6Xw2q4wQRH5lqKq2bednpVTfdau1gbCevpZlWdM/VNef6gZVEJVRfyyAk0LFWFEwr9Sku49i8BmFlUkUBkQIDhf2sXduCcoyYMuTcPWGo3vFBY9Hv4MHKYEpM0eDSaDilzgOsdjYkeV9eLvkiDwf41YfzaKj9CDwG4gRNYAf+NIE/yOegqluqk/0fgHn33sthTXPQcrAGCfbo5B6sjQjx49m8Phmsd01jZZSCPFkUkxUSqnfmsliubH5L/wHgeMIj+eg61oAAAAASUVORK5CYII=',
}

function clave(tipo, prenda) {
  if (prenda === 'chaq') return tipo === 'cuello' ? 'cuelloChaq' : tipo === 'puno' ? 'punoChaq' : 'pretina'
  return tipo === 'cuello' ? 'cuello' : 'puno'
}

export function IconoPrenda({ tipo, prenda }) {
  const k = clave(tipo, prenda)
  return <img src={IMG[k]} alt="" className={`ico-prenda${k === 'pretina' || k === 'puno' ? ' ancho' : ''}`} />
}

// Insignia de tipo de ítem: iconos + nombres (ej. [cuello][puño] Cuello · Puño).
// prenda: 'cam' | 'chaq'. extra: texto opcional al final (ej. "— Camiseta").
export function InsigniaTipos({ tipos, prenda, extra }) {
  const lista = tipos || []
  return (
    <span className={`badge ${prenda}`}>
      {lista.map((t) => <IconoPrenda key={t} tipo={t} prenda={prenda} />)}
      <span>{lista.map((t) => TIPO_LABEL[t]).join(' · ')}{extra ? ` ${extra}` : ''}</span>
    </span>
  )
}

// Insignia verde de juego (cuello + puño juntos) con su precio.
export function InsigniaJuego({ precio }) {
  return (
    <span className="badge cam" style={{ background: '#4b8523', color: '#fff' }}>
      <IconoPrenda tipo="cuello" prenda="cam" />
      <IconoPrenda tipo="puno" prenda="cam" />
      <span>Juego {precio} c/u</span>
    </span>
  )
}
