import pandas as pd
import torch
import numpy as np
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from typing import Tuple, List, Any
from sklearn.inspection import permutation_importance
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.linear_model import LogisticRegression

# Ensure we use GPU if available
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def split_samples(
    X: np.ndarray, y: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Splits data into 80% training/validation and 20% test sets.
    """
    return train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)


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


def train_classifier_pipeline():
    # Load the embeddings generated in the previous step
    # (Assuming they were saved as positive_embeddings.npy and negative_embeddings.npy)
    pos_X = np.load("pos_refined_weak_labels_embeddings.npy")
    neg_X = np.load("neg_refined_weak_labels_embeddings2.npy")

    # Create labels: 1 for positive (noncompliant), 0 for negative (compliant)
    pos_y = np.ones(pos_X.shape[0])
    neg_y = np.zeros(neg_X.shape[0])

    # Combine into master feature matrix and target vector
    X = np.vstack((pos_X, neg_X))
    y = np.concatenate((pos_y, neg_y))

    # --- Pipeline Execution ---

    # 1. Split the data
    trainX, testX, trainY, testY = split_samples(X, y)

    # 2. Train and Evaluate
    classifier, accuracy = classification_task(trainX, trainY, testX, testY)

    print(f"\nFinal Test Accuracy: {accuracy:.4f}")

    # Assume 'classifier' is your trained LogisticRegression object
    model_filename = "noncompliance_classifier_v2.pkl"

    # Save the complete package
    joblib.dump(classifier, model_filename)

    print(f"Model successfully packaged and saved to {model_filename}")

    # 3. Demo (Assuming you have a metadata dataframe for the test set)
    # test_indices = labels for the 20% held-out data
    # demo_results = demo_task(classifier, testX, test_metadata)

# new_case_embedding should be the (1, 768) vector from Legal-BERT
def run_prediction(new_case_embedding):
    clf = joblib.load("noncompliance_classifier_v1.pkl")
    
    prediction = clf.predict(new_case_embedding)
    probability = clf.predict_proba(new_case_embedding)

    label = "NONCOMPLIANT" if prediction[0] == 1 else "COMPLIANT"
    conf = probability[0][1] if prediction[0] == 1 else probability[0][0]

    return f"Result: {label} ({conf:.2%% confidence})"

if __name__ == "__main__":
    train_classifier_pipeline()
