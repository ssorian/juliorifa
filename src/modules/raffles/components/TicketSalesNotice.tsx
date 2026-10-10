export function TicketSalesNotice({ state }: { state: 'closed' | 'sold-out' }) {
  return (
    <section className="ticket-sales-notice" role="status">
      <p className="eyebrow">// SIGUE EN EL JUEGO</p>
      <h2>{state === 'closed' ? 'Esta rifa ha finalizado' : 'Boletos agotados'}</h2>
      <p>No es posible comprar boletos para esta rifa.</p>
      <a className="button primary" href="/">Sigue participando en otra rifa</a>
    </section>
  )
}
