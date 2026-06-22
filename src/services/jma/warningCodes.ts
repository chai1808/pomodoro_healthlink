const JMA_WARNING_LABELS: Record<string, string> = {
  '02': '暴風雪特別警報',
  '03': '暴風雪警報',
  '04': '暴風雪注意報',
  '05': '大雨特別警報',
  '06': '大雨警報',
  '07': '大雨注意報',
  '08': '洪水警報',
  '09': '洪水注意報',
  '10': '暴風特別警報',
  '11': '暴風警報',
  '12': '暴風注意報',
  '13': '大雪特別警報',
  '14': '大雪警報',
  '15': '大雪注意報',
  '16': '波浪特別警報',
  '17': '波浪警報',
  '18': '波浪注意報',
  '19': '高潮特別警報',
  '20': '高潮警報',
  '21': '高潮注意報',
  '22': '濃霧注意報',
  '23': '雷注意報',
  '24': '強風注意報',
  '25': '強風注意報',
}

export const kindCodeToLabel = (
  code: string | undefined,
  propertyType?: string,
): string => {
  if (propertyType === '風') return '強風注意報'
  if (propertyType === '雨') return '大雨注意報'
  if (propertyType === '雪') return '大雪注意報'
  if (propertyType === '波') return '波浪注意報'
  if (propertyType === '潮') return '高潮注意報'

  if (code && JMA_WARNING_LABELS[code]) {
    return JMA_WARNING_LABELS[code]
  }

  return code ? `注意報（コード${code}）` : '注意報'
}
