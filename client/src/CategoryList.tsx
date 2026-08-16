import { useEffect, useState } from 'react'

type Category = {
  id: number
  name: string
  createdAt: string
}

function CategoryList() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded with ${res.status}`)
        return res.json() as Promise<Category[]>
      })
      .then(setCategories)
      .catch(() => setError('Unable to load categories. Please try again later.'))
  }, [])

  if (error) {
    return <p className="text-danger">{error}</p>
  }

  if (!categories) {
    return <p className="text-muted">Loading categories...</p>
  }

  return (
    <ul className="list-group">
      {categories.map((category) => (
        <li key={category.id} className="list-group-item">
          {category.name}
        </li>
      ))}
    </ul>
  )
}

export default CategoryList
