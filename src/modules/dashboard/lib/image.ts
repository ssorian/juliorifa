export function validateImageFile(file: { type: string; size: number }) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size <= 0 ||
    file.size > 2 * 1024 * 1024
  )
    throw new Error('Usa una imagen PNG, JPG o WebP de hasta 2 MB.')
}
export async function readImage(file: File) {
  validateImageFile(file)
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png =
    signature.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => signature[i] === n)
  const jpeg =
    signature[0] === 255 && signature[1] === 216 && signature[2] === 255
  const webp =
    new TextDecoder().decode(signature.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(signature.slice(8, 12)) === 'WEBP'
  if (
    !(file.type === 'image/png'
      ? png
      : file.type === 'image/jpeg'
        ? jpeg
        : webp)
  )
    throw new Error('El contenido no corresponde a una imagen raster válida.')
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('No se pudo leer la imagen.'))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      image.naturalWidth > 0 &&
      image.naturalHeight > 0 &&
      image.naturalWidth * image.naturalHeight <= 40000000
        ? resolve()
        : reject(new Error('La imagen excede 40 megapíxeles.'))
    image.onerror = () => reject(new Error('No se pudo decodificar la imagen.'))
    image.src = data
  })
  return data
}
