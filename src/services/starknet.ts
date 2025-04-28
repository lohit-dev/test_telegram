import { RpcProvider } from "starknet";

export class StarknetService {
    provider: RpcProvider;

    constructor(provider: RpcProvider) {
        this.provider = provider;
    }

}