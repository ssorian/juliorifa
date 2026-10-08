// Retired fixture endpoint: no notification worker or delivery is executed.
export async function pump() {
  return { sent: 0, retry: 0 }
}
