export function isProbablyMobileUserAgent(userAgent: string | null) {
  if (!userAgent) {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(userAgent);
}
