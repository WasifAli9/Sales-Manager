import { useListGoals, useCreateGoal, useUpdateGoal, useDeleteGoal, useGetNumberSummary, getListGoalsQueryKey, getGetNumberSummaryQueryKey, getGetTodaySummaryQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

export function useGoalsData() {
  const goals = useListGoals()
  const numberSummary = useGetNumberSummary()
  
  return { goals, numberSummary }
}

export function useGoalsMutations() {
  const queryClient = useQueryClient()

  const create = useCreateGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetNumberSummaryQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() })
      }
    }
  })

  const update = useUpdateGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetNumberSummaryQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() })
      }
    }
  })

  const del = useDeleteGoal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGoalsQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetNumberSummaryQueryKey() })
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() })
      }
    }
  })

  return { createGoal: create, updateGoal: update, deleteGoal: del }
}
