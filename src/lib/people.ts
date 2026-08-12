import type { Id, Person } from '@/types/domain'

/**
 * Who may be picked as an owner or an author.
 *
 * Deactivated people stay in the snapshot — a deal they own still has to render their name, and a
 * three-year-old activity still has to say who logged it — so they are filtered out at the point of
 * *choosing* rather than at the point of loading.
 *
 * `keep` is the id already selected, and it is kept whatever its state. Dropping a deactivated current
 * owner from their own deal's dropdown would leave the select with a value matching no option, which
 * browsers render as the first name in the list: the screen would quietly claim the deal belongs to
 * somebody it does not, and saving anything else on that form would make the claim true.
 */
export function assignableOwners(people: Person[], keep?: Id | null): Person[] {
  return people.filter((person) => person.isActive || person.id === keep)
}
