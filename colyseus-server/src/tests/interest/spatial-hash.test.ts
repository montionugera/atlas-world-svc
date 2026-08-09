import { SpatialHash, SpatialEntity } from '../../interest/SpatialHash'

const e = (id: string, x: number, y: number): SpatialEntity => ({ id, x, y })

describe('SpatialHash', () => {
  it('returns entities within the radius and excludes those outside', () => {
    const hash = new SpatialHash<SpatialEntity>(50)
    hash.insert(e('near', 105, 100))
    hash.insert(e('far', 400, 400))

    const found = hash.queryRadius(100, 100, 20).map(x => x.id)

    expect(found).toEqual(['near'])
  })

  it('uses circular distance, not the square of the scanned cells', () => {
    const hash = new SpatialHash<SpatialEntity>(50)
    // (121, 121) is inside the AABB of radius 30 around (100,100) but its
    // euclidean distance is ~29.7 -> inside. (122,122) is ~31.1 -> outside.
    hash.insert(e('inside-circle', 121, 121))
    hash.insert(e('outside-circle', 122, 122))

    const found = hash.queryRadius(100, 100, 30).map(x => x.id)

    expect(found).toEqual(['inside-circle'])
  })

  it('finds entities that sit in a neighbouring cell', () => {
    const hash = new SpatialHash<SpatialEntity>(50)
    // 149 and 151 straddle the cell boundary at x=150.
    hash.insert(e('left-cell', 149, 100))
    hash.insert(e('right-cell', 151, 100))

    const found = hash
      .queryRadius(150, 100, 5)
      .map(x => x.id)
      .sort()

    expect(found).toEqual(['left-cell', 'right-cell'])
  })

  it('returns an entity exactly on the radius boundary', () => {
    const hash = new SpatialHash<SpatialEntity>(50)
    hash.insert(e('on-edge', 130, 100))

    expect(hash.queryRadius(100, 100, 30).map(x => x.id)).toEqual(['on-edge'])
  })

  it('clear() empties the index', () => {
    const hash = new SpatialHash<SpatialEntity>(50)
    hash.insert(e('a', 100, 100))
    hash.clear()

    expect(hash.queryRadius(100, 100, 100)).toEqual([])
  })

  it('handles negative coordinates', () => {
    const hash = new SpatialHash<SpatialEntity>(50)
    hash.insert(e('neg', -105, -100))

    expect(hash.queryRadius(-100, -100, 20).map(x => x.id)).toEqual(['neg'])
  })

  it('returns each entity at most once even when cells overlap the query', () => {
    const hash = new SpatialHash<SpatialEntity>(10)
    hash.insert(e('solo', 100, 100))

    // Radius spans many cells; the entity must not be emitted per-cell.
    expect(hash.queryRadius(100, 100, 100).map(x => x.id)).toEqual(['solo'])
  })
})
