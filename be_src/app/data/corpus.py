"""Portfolio knowledge corpus — the single source of truth.

The frontend graph fetches this via /api/chat/graph (its bundled copy is
only a fallback for when the backend is unreachable). Each entry is both
a graph node (projects only) and a retrievable document:

  * ``desc``  — what answers actually quote
  * ``blurb`` — extra retrieval surface appended to the embedded text
"""
from __future__ import annotations

PROJECTS: list[dict] = [
    {
        "id": "quantum",
        "kind": "project",
        "title": "Quantum Simulator",
        "year": "2024",
        "lean": "research",
        "tags": ["research", "tensor-networks", "python"],
        "stack": "Python · NumPy · TensorNetwork",
        "desc": (
            "A tensor-network simulator for quantum circuits that approximates qubit "
            "states without the exponential memory blow-up of a full state vector."
        ),
        "url": "/posts/quantumSimulator",
        "blurb": (
            "quantum circuit simulation tensor network research python physics "
            "numerical machine learning linear algebra eigenstate qubit state vector"
        ),
    },
    {
        "id": "handpose",
        "kind": "project",
        "title": "Hand Pose Estimation",
        "year": "2023",
        "lean": "ml",
        "tags": ["ml", "computer-vision", "real-time"],
        "stack": "Python · MediaPipe · XGBoost",
        "desc": (
            "Real-time hand-pose estimation from a plain webcam — keypoint detection "
            "feeding a lightweight gesture classifier that runs live in the browser."
        ),
        "url": "/posts/handPoseEstimation",
        "blurb": (
            "machine learning computer vision real time hand pose gesture keypoint "
            "webcam perception inference model neural prediction live classifier"
        ),
    },
    {
        "id": "graphsearch",
        "kind": "project",
        "title": "Semantic Graph Search",
        "year": "2025",
        "lean": "ml",
        "tags": ["embeddings", "retrieval", "rag"],
        "stack": "FastAPI · embeddings · canvas",
        "desc": (
            "This page. Your question is embedded, my work is ranked by cosine "
            "similarity, then drawn as a force-directed map and answered with RAG."
        ),
        "url": "#",
        "blurb": (
            "semantic search embeddings retrieval vector similarity rag "
            "interface graph machine learning ranking nearest neighbor cosine chat"
        ),
    },
    {
        "id": "gillsans",
        "kind": "project",
        "title": "Gill Sans",
        "year": "2022",
        "lean": "design",
        "tags": ["motion", "typography", "stop-motion"],
        "stack": "Blender · After Effects",
        "desc": (
            "A stop-motion typographic study that animates Gill Sans letterforms frame "
            "by frame — a love letter to a typeface, built by hand."
        ),
        "url": "/posts/gillSans",
        "blurb": (
            "typography type motion stop motion design letterform animation craft "
            "visual lettering kinetic frame editorial typeface gill sans"
        ),
    },
    {
        "id": "art",
        "kind": "project",
        "title": "Visual Art Portfolio",
        "year": "2021",
        "lean": "art",
        "tags": ["art", "print", "drawing"],
        "stack": "Pencil · ink · screen-print",
        "desc": (
            "Selected drawings and prints — figure studies in pencil and ink, and a "
            "small series of screen-prints. The analog half of the practice."
        ),
        "url": "/posts/visualArtPortfolio",
        "blurb": (
            "art drawing print painting visual craft sketch portfolio analog "
            "figure composition pencil ink screenprint studies"
        ),
    },
    {
        "id": "ds",
        "kind": "project",
        "title": "Interface Design System",
        "year": "2024",
        "lean": "design",
        "tags": ["tokens", "components", "react"],
        "stack": "TypeScript · React · CSS tokens",
        "desc": (
            "A token-based design system with accessible React components and living "
            "documentation — the bridge between how something looks and how it ships."
        ),
        "url": "#",
        "blurb": (
            "design system tokens components react interface engineering frontend "
            "ui craft typography accessibility documentation styling library"
        ),
    },
]

BIO: dict = {
    "id": "bio",
    "kind": "bio",
    "title": "Jae Hong Lee",
    "desc": (
        "Jae Hong Lee (이재홍) is a design engineer based in Seoul. He studied computer "
        "science and visual arts, and works at the seam of CS, design, and AI — designing "
        "an interface and building what's underneath it, models included. He cares about "
        "precision and craft over spectacle."
    ),
    "blurb": (
        "jae hong lee design engineer seoul korea who am i about bio person computer "
        "science visual arts ai machine learning interface design build models "
        "front end research typography craft precision hire contact collaboration"
    ),
}

KNOWLEDGE: list[dict] = [*PROJECTS, BIO]

_BY_ID = {d["id"]: d for d in KNOWLEDGE}


def by_id(doc_id: str) -> dict | None:
    return _BY_ID.get(doc_id)
