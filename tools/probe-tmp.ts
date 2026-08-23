import { DeltaStore, STORE_VERSION, packBlockState, cellSlot, ChunkDeltas } from "chamfer/edit";
import { ChunkAddress, TerrainGenerator, buildCoarseMap, generateChunk, seedFromString, coarseChunkKey, BlockType } from "chamfer/generation";
import { joinPath } from "chamfer/addressing";
import { WorldShape } from "chamfer/world";
const DEPTH=8, FINEST=4, LAYERS=40, SEED=seedFromString("worker");
const shape=new WorldShape(1700,DEPTH,150,LAYERS);
const map=buildCoarseMap(SEED,{level:5});
const address=new ChunkAddress(3,[1,2,0,3]);
const edits=new DeltaStore({version:STORE_VERSION,subdivisionDepth:DEPTH,chunkLevel:FINEST,registry:["chamfer:air","chamfer:stone"]});
const terrain=new TerrainGenerator(SEED,shape,map);
const chunk=generateChunk(terrain,address,FINEST,LAYERS);
const [i,j]=joinPath(address.path,4,4,DEPTH);
const ground=chunk.columnOf(cellSlot({face:3,i,j,layer:0},DEPTH,FINEST).slot).first;
for(let a=0;a<6;a++)for(let u=1;u<=3;u++){
  const [x,y]=joinPath(address.path,4+a,4,DEPTH);
  edits.write({face:3,i:x,j:y,layer:ground-u},packBlockState(BlockType.SNOW));
}
for(const lod of [0,1,2,3]){
  const level=FINEST-lod;
  const key=coarseChunkKey(address.key,FINEST,level);
  const rows=edits.rowsUnder(key,level);
  console.log("lod",lod,"level",level,"key",key,"rows",rows.length);
  for(const r of rows){
    const packed=r.deltas.pack();
    const back=ChunkDeltas.unpack(packed.where,packed.what);
    const recs=[...back.records()];
    console.log("   row",r.chunkKey,"records",recs.length,"first",JSON.stringify(recs[0]));
  }
}
