/** Türkçe karakterleri ve aksanları sadeleştirip küçük harfe çevirir: "Ürün Adı" -> "urun adi" */
export function fold(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
}
