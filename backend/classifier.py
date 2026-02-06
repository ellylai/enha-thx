import pandas as pd
import torch
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, classification_report
from transformers import AutoTokenizer, AutoModel
from typing import Tuple, List, Any
from sklearn.inspection import permutation_importance
from sklearn.model_selection import StratifiedKFold, cross_val_score

# Ensure we use GPU if available
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def split_samples(
    X: np.ndarray, y: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Splits data into 80% training/validation and 20% test sets.
    """
    return train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)


def classification_task(
    trainX: np.ndarray, trainY: np.ndarray, testX: np.ndarray, testY: np.ndarray
) -> Tuple[LogisticRegression, float]:
    classifier = LogisticRegression(class_weight="balanced", max_iter=2000)

    # 1. 5-Fold Cross Validation with Stratification
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(classifier, trainX, trainY, cv=skf)
    print(f"Mean CV Accuracy: {cv_scores.mean():.4f}")

    # 2. Train on full set and evaluate
    classifier.fit(trainX, trainY)
    accuracy = classifier.score(testX, testY)

    # 3. Permutation Feature Importance
    # This identifies which dimensions in the embedding space matter most
    result = permutation_importance(
        classifier, testX, testY, n_repeats=10, random_state=42
    )
    top_indices = result.importances_mean.argsort()[-10:][::-1]
    print(f"\nTop 10 Important Embedding Dimensions: {top_indices}")

    return classifier, accuracy


def demo_task(
    classifier: LogisticRegression, testX: np.ndarray, test_metadata: pd.DataFrame
) -> pd.DataFrame:
    # 1. Flag cases predicted as noncompliant
    predictions = classifier.predict(testX)
    test_metadata["predicted_violation"] = predictions
    flagged = test_metadata[test_metadata["predicted_violation"] == 1].copy()

    print(f"Identified {len(flagged)} potentially noncompliant cases.")

    # 2. Example structure for LLM integration
    # For each flagged case, you would pass 'text_descriptions' to an LLM
    # to summarize specific order violations found in the docket.

    return flagged

