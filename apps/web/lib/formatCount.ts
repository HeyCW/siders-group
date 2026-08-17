/** Indonesian thousands grouping — shared so the engagement bar and the comment section agree on
 *  how a count above 999 reads, rather than one showing "1.200" and the other "1200". */
export function formatCount(value: number): string {
  return value.toLocaleString('id-ID');
}
