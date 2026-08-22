/**
 * How bright a vertex is, by how many of its neighbours are solid.
 *
 * A corner of a hexagon is shared by three cells, so a face's vertex has the
 * cell itself and **two** others touching it, and the shade takes three values.
 * A cube's corner is shared by four cells and its vertex has three others, so
 * the tables written for cube worlds have four entries and do not carry over.
 *
 * This is the one shading term a vertex has to carry, because it is a fact
 * about which cells stand around that corner and the shader cannot see them.
 * Which way a face points is a fact the shader works out for itself.
 */
export const AMBIENT_OCCLUSION: readonly number[] = [1, 0.76, 0.55];
