import System from "./System";

interface Node {
    id: string;
    label?: string;
    group?: string | number;
}

interface Edge {
    from: string;
    to: string;
}

type GraphData = {
    systemId: number;
    systemName: string;
    connectedTo: string[];
}[]

class Graph {
    static applyForceDirectedLayout(graphData: GraphData): { nodes: Node[]; edges: Edge[] } {
        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const addedEdges: Set<string> = new Set();

        // Convert the graph data to nodes and edges
        graphData.forEach((nodeData) => {
            const system = System.jsonData?.solarSystems.find(s => s.name === nodeData.systemName);
            const node: Node = {
                id: nodeData.systemName,
                label: nodeData.systemName,
                group: system!.region,
            };

            nodes.push(node);

            nodeData.connectedTo.forEach((connectedSystemName) => {

                const edgeId1 = `${nodeData.systemName}-${connectedSystemName}`;
                const edgeId2 = `${connectedSystemName}-${nodeData.systemName}`;

                // Check if an edge with the same source and target already exists
                if (!addedEdges.has(edgeId1) && !addedEdges.has(edgeId2)) {
                    const edge: Edge = {
                        from: nodeData.systemName,
                        to: connectedSystemName,
                    };

                    edges.push(edge);

                    // Add the edge to the set to prevent duplicates
                    addedEdges.add(edgeId1);
                    addedEdges.add(edgeId2);
                }
            });
        });

        return { nodes, edges };
    }
}

export default Graph;