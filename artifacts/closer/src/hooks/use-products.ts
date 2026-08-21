import { useListProducts, useGetProduct, useCreateProduct, useUpdateProduct, useDeleteProduct, getListProductsQueryKey, getGetProductQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

export function useProductsData() {
  const products = useListProducts()
  return { products }
}

export function useProductDetail(id: number) {
  return useGetProduct(id, { query: { enabled: !!id, queryKey: getGetProductQueryKey(id) } })
}

export function useProductsMutations() {
  const queryClient = useQueryClient()

  const createProd = useCreateProduct({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
    }
  })

  const updateProd = useUpdateProduct({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
        queryClient.setQueryData(getGetProductQueryKey(data.id), data)
      }
    }
  })

  const deleteProd = useDeleteProduct({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() })
    }
  })

  return {
    createProduct: createProd,
    updateProduct: updateProd,
    deleteProduct: deleteProd
  }
}
