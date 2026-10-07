import { Income } from './Income'

export function Overview() {
  return (
    <>
      <p className="section-note">
        Datos actuales del servidor. No hay simulaciones, inventario local ni
        datos ficticios. Las transferencias y sorteos se confirman en sus
        secciones.
      </p>
      <Income />
    </>
  )
}
