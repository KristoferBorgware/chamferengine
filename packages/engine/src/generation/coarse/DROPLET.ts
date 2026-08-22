/**
 * What a droplet does, in metres and fractions rather than in grid units.
 *
 * **Heights are metres and the grid is metres**, so every number here means
 * something on the ground: a knob set once holds its meaning on a planet of any
 * size and a map drawn at any level.
 */
export const DROPLET = {
	/** How many droplets one unit of the erosion knob runs, per cell of the map. */
	perCell: 1.5,

	/** How many cells a droplet may cross before it is abandoned. */
	maxSteps: 48,

	/**
	 * How much a droplet may carry, as metres of height per unit of gradient.
	 *
	 * Capacity is a **gradient** times this, never a fall in metres times a cell
	 * width -- that made a droplet crossing flat ground on a 100 m map want to
	 * carry `15 m` of material, and cut it out. The gradient form means the same
	 * hillside erodes by the same amount whatever the map's cell size is.
	 */
	capacity: 8,

	/** A floor under the gradient, so a droplet on flat ground still carries. */
	minGradient: 0.01,

	/** How much of the excess a slowing droplet puts down in one step. */
	depositRate: 0.1,

	/** How much of the shortfall a hungry droplet cuts out in one step. */
	erosionRate: 0.05,

	/**
	 * The most of one step's fall a single droplet may cut, as a fraction.
	 *
	 * Without it a droplet meeting a tall step takes the whole thing at once and
	 * leaves a pit for the next one to fall into. A cell is crossed by dozens of
	 * droplets, so a tenth each is still a valley by the end, and the shapes
	 * come out graded rather than pocked. Uncapped, erosion **multiplied** the
	 * median slope by four and the 90th percentile by seven, which is the
	 * opposite of what water does to a hillside.
	 */
	maxCut: 0.1,

	/**
	 * What a cell keeps of the material a cell-to-cell droplet cut from it; the
	 * rest is divided over the ring.
	 *
	 * At `0.5` the centre drops six times as far as any neighbour, which is a
	 * spike, and a pass built out of spikes adds roughness rather than carving:
	 * measured on the shipped map it takes the median hillslope up `1.41x`
	 * against `1.17x` at zero, where the cut is flat across the seven.
	 */
	cutShare: 0.5,

	/**
	 * How much of the previous direction a free droplet keeps.
	 *
	 * At zero it turns straight downhill every step, which is gradient descent;
	 * near one it runs almost straight and leaves the ground behind it.
	 */
	inertia: 0.3,

	/** How much speed a droplet gains per metre of fall. */
	gravity: 4,

	/** How much of a droplet's water is gone after one step. */
	evaporation: 0.02,
} as const;
