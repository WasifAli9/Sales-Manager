import { useListResources, useCreateResource, useUpdateResource, useDeleteResource, useRunToolAdvisor, getListResourcesQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

export function useStackData() {
  const resources = useListResources()
  return { resources }
}

export function useStackMutations() {
  const queryClient = useQueryClient()

  const create = useCreateResource({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() })
    }
  })

  const update = useUpdateResource({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() })
    }
  })

  const del = useDeleteResource({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() })
    }
  })

  const advisor = useRunToolAdvisor({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() })
    }
  })

  return { createResource: create, updateResource: update, deleteResource: del, runAdvisor: advisor }
}
