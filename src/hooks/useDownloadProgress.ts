import { useEffect, useState } from 'react';
import type { DownloadProgress, IcnxProgressSystem } from '../types';

// Hook returns a map of url->progress and subscribes to global progress system if present.
export function useDownloadProgress() {
	const [all, setAll] = useState<Record<string, DownloadProgress>>({});

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const g: any = window as any;
		const sys: IcnxProgressSystem | undefined = g.__icnxProgressSystem;
		if (sys) {
			setAll(sys.getAllProgress());
			const unsub = sys.addSubscriber((_u,_d,allMap) => setAll(allMap));
			return () => unsub();
		} else if (g.__icnxProgress) {
			setAll({ ...g.__icnxProgress });
			const id = setInterval(() => {
				try { setAll({ ...g.__icnxProgress }); } catch(_) {}
			}, 750);
			return () => clearInterval(id);
		}
	}, []);

	return all;
}

export default useDownloadProgress;
