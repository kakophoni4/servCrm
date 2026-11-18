export function masterContactVisible(order:{masterId?:string|null;isPersonal?:boolean},acceptedValue?:string|null){return !!order.isPersonal||!order.masterId||acceptedValue===order.masterId;}
