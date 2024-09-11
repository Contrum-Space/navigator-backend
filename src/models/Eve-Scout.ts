import axios from "axios";
import { Jump } from "./System"; // Import the Jump type from System.js

interface Signature {
    id: number;  
    created_at: string;  
    created_by_id: number;  
    created_by_name: string;  
    updated_at?: string;  
    updated_by_id?: number;  
    updated_by_name?: string;  
    completed_at?: string;  
    completed_by_id?: number;  
    completed_by_name?: string;  
    completed: boolean;  
    wh_exits_outward?: boolean;  
    wh_type?: string;  
    max_ship_size?: 'small' | 'medium' | 'large' | 'xlarge' | 'capital' | 'unknown';  
    expires_at: string;  
    remaining_hours?: number;  
    signature_type: 'combat' | 'data' | 'gas' | 'relic' | 'wormhole' | 'unknown';  
    out_system_id: 31000005 | 30002086;  
    out_system_name: 'Thera' | 'Turnur';  
    out_signature: string;  
    in_system_id?: number;  
    in_system_class?: 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c10' | 'c11' | 'c12' | 'c13' | 'c14' | 'c15' | 'c16' | 'c17' | 'c18' | 'c25' | 'drone' | 'exit' | 'hs' | 'jove' | 'ls' | 'ns' | 'unknown';  
    in_system_name: string;  
    in_region_id: number;  
    in_region_name?: string;  
    in_signature?: string;  
    comment?: string;
}

class EVEScout {
    private static basePath: string = 'https://api.eve-scout.com/v2/public/';
    private static cache: { data: Signature[]; timestamp: number } | null = null;
    private static cacheLifetime = 30 * 60 * 1000; // 30 minutes in milliseconds

    static async getConnections(useThera: boolean, useTurnur: boolean): Promise<Jump[]> {
        if (this.cache && Date.now() - this.cache.timestamp < this.cacheLifetime) {
            return this.processSignatures(this.cache.data, useThera, useTurnur);
        }

        const signatures = await axios.get<Signature[]>(`${this.basePath}signatures`);
        this.cache = { data: signatures.data, timestamp: Date.now() };
        return this.processSignatures(signatures.data, useThera, useTurnur);
    }

    private static processSignatures(signatures: Signature[], useThera: boolean, useTurnur: boolean): Jump[] {
        const jumps: Jump[] = [];

        for (const sig of signatures) {
            if (!useThera && (sig.in_region_name === 'Thera' || sig.out_system_name === 'Thera')) continue;
            if (!useTurnur && (sig.in_region_name === 'Turnur' || sig.out_system_name === 'Turnur')) continue;

            jumps.push({ from: sig.in_system_id!, to: sig.out_system_id, max_ship_size: sig.max_ship_size });
            jumps.push({ from: sig.out_system_id, to: sig.in_system_id!, max_ship_size: sig.max_ship_size });
        }

        return jumps;
    }
}

export default EVEScout;