import { useCreation } from '@/app/creation'
import { Drawer } from '@/components/ui/Drawer'
import { CreateAccountForm } from './CreateAccountForm'
import { CreateLeadForm } from './CreateLeadForm'
import { CreateDealForm } from './CreateDealForm'
import { CreateUserForm } from './CreateUserForm'

const COPY = {
  account: {
    title: 'New account',
    eyebrow: 'Account',
  },
  lead: {
    title: 'New business unit',
    eyebrow: 'Lead',
  },
  deal: {
    title: 'New deal',
    eyebrow: 'Opportunity',
  },
  user: {
    title: 'New user',
    eyebrow: 'Team',
  },
} as const

/**
 * Creation happens in the same right-side drawer as everything else.
 *
 * A modal would be the conventional choice, but the whole app is built on not losing your
 * place (spec 7.1) — creating a deal from a board column should leave that column visible
 * behind it, so the context you were working in is still there when you finish.
 */
export function CreateDrawer() {
  const { request, closeCreate } = useCreation()
  if (!request) return null

  const copy = COPY[request.kind]

  return (
    <Drawer open onClose={closeCreate} title={copy.title} eyebrow={copy.eyebrow}>
      {request.kind === 'account' && <CreateAccountForm onDone={closeCreate} />}
      {request.kind === 'lead' && (
        <CreateLeadForm defaultAccountId={request.accountId} onDone={closeCreate} />
      )}
      {request.kind === 'user' && <CreateUserForm onDone={closeCreate} />}
      {request.kind === 'deal' && (
        <CreateDealForm
          defaultAccountId={request.accountId}
          defaultLeadId={request.leadId}
          defaultPipelineId={request.pipelineId}
          defaultStageId={request.stageId}
          onDone={closeCreate}
        />
      )}
    </Drawer>
  )
}
