import { useListVisionItems, useCreateVisionItem, useUpdateVisionItem, useDeleteVisionItem, getListVisionItemsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

export function useVisionData() {
  const items = useListVisionItems()
  return { items }
}

export function useVisionMutations() {
  const queryClient = useQueryClient()

  const create = useCreateVisionItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVisionItemsQueryKey() })
    }
  })

  const update = useUpdateVisionItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVisionItemsQueryKey() })
    }
  })

  const del = useDeleteVisionItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListVisionItemsQueryKey() })
    }
  })

  return { createVisionItem: create, updateVisionItem: update, deleteVisionItem: del }
}
