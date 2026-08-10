import { useMemo } from 'react'
import { useStore } from '@/data/store'
import { useSelection } from '@/app/selection'
import { Drawer } from '@/components/ui/Drawer'
import { DealDrawerBody } from './DealDrawerBody'
import { LeadDrawerBody } from './LeadDrawerBody'
import { AccountDrawerBody } from './AccountDrawerBody'

/**
 * Single drawer host. It resolves whatever is selected to the right body, so every
 * screen opens details the same way and there is only one drawer in the tree.
 */
export function RecordDrawer() {
  const { snapshot } = useStore()
  const { selection, clear } = useSelection()

  const resolved = useMemo(() => {
    if (!selection) return null
    if (selection.type === 'deal') {
      const deal = snapshot.deals.find((d) => d.id === selection.id)
      if (!deal) return null
      const account = snapshot.accounts.find((a) => a.id === deal.accountId)
      return { kind: 'deal' as const, title: deal.name, eyebrow: account?.name ?? 'Deal', dealId: deal.id }
    }
    if (selection.type === 'lead') {
      const lead = snapshot.leads.find((l) => l.id === selection.id)
      if (!lead) return null
      const account = snapshot.accounts.find((a) => a.id === lead.accountId)
      return {
        kind: 'lead' as const,
        title: lead.businessUnit,
        eyebrow: account?.name ?? 'Lead',
        leadId: lead.id,
      }
    }
    const account = snapshot.accounts.find((a) => a.id === selection.id)
    if (!account) return null
    return {
      kind: 'account' as const,
      title: account.name,
      eyebrow: account.isPartner ? 'Partner' : 'Account',
      accountId: account.id,
    }
  }, [selection, snapshot])

  if (!resolved) return null

  return (
    <Drawer open onClose={clear} title={resolved.title} eyebrow={resolved.eyebrow}>
      {resolved.kind === 'deal' && <DealDrawerBody dealId={resolved.dealId} />}
      {resolved.kind === 'lead' && <LeadDrawerBody leadId={resolved.leadId} />}
      {resolved.kind === 'account' && <AccountDrawerBody accountId={resolved.accountId} />}
    </Drawer>
  )
}
