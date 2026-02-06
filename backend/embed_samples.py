# IMMA TRY TO DO THIS IN COLAB
import pandas as pd
import torch
import numpy as np
from transformers import AutoTokenizer, AutoModel
from typing import Tuple, List, Any

# Ensure we use GPU if available
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def embed_samples(samples: pd.DataFrame) -> np.ndarray:
    model_name = "nlpaueb/legal-bert-base-uncased"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name).to(device)

    # 512 token limit with overlap to maintain narrative context
    window_size = 510
    stride = 256
    all_embeddings = []

    for text in samples["text_descriptions"]:
        tokens = tokenizer(text, add_special_tokens=False, return_tensors="pt")
        input_ids = tokens["input_ids"][0]
        chunk_embeddings = []

        for i in range(0, len(input_ids), stride):
            chunk = input_ids[i : i + window_size]
            chunk_with_special = (
                torch.cat(
                    [
                        torch.tensor([tokenizer.cls_token_id]),
                        chunk,
                        torch.tensor([tokenizer.sep_token_id]),
                    ]
                )
                .unsqueeze(0)
                .to(device)
            )

            with torch.no_grad():
                outputs = model(chunk_with_special)
                chunk_embeddings.append(
                    outputs.last_hidden_state[0, 0, :].cpu().numpy()
                )
            if i + window_size >= len(input_ids):
                break

        all_embeddings.append(np.mean(chunk_embeddings, axis=0))

    return np.array(all_embeddings)
