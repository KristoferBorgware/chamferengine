/**
 * How bright a vertex is, by how many of its neighbours are solid.
 *
 * A corner of a hexagon is shared by three cells, so a face's vertex has the
 * cell itself and **two** others touching it, and the shade takes three values.
 * A cube's corner is shared by four cells and its vertex has three others, so
 * the tables written for cube worlds have four entries and do not carry over.
 */
export const AMBIENT_OCCLUSION: readonly number[] = [1, 0.76, 0.55];

/**
 * How bright a face is before occlusion, by which way it points.
 *
 * A single directional term standing in for a sky: upward faces take the most
 * light, sides less, and downward faces least.
 */
export const FACE_SHADE = {
	top: 1,
	side: 0.82,
	bottom: 0.5,
} as const;
